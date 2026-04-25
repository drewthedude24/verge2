import AVFoundation
import Foundation
import Speech

struct DictationEvent: Encodable {
    let type: String
    let text: String?
    let code: String?
    let message: String?
    let isFinal: Bool?

    init(type: String, text: String? = nil, code: String? = nil, message: String? = nil, isFinal: Bool? = nil) {
        self.type = type
        self.text = text
        self.code = code
        self.message = message
        self.isFinal = isFinal
    }
}

func emit(_ event: DictationEvent) {
    let encoder = JSONEncoder()
    guard let data = try? encoder.encode(event), let line = String(data: data, encoding: .utf8) else {
        return
    }

    FileHandle.standardOutput.write(Data((line + "\n").utf8))
}

func mergeTranscriptSnapshots(previous: String, next: String) -> String {
    let previous = previous.trimmingCharacters(in: .whitespacesAndNewlines)
    let next = next.trimmingCharacters(in: .whitespacesAndNewlines)

    if next.isEmpty {
        return previous
    }

    if previous.isEmpty {
        return next
    }

    if next == previous {
        return previous
    }

    if next.hasPrefix(previous) {
        return next
    }

    if previous.hasPrefix(next) || previous.localizedCaseInsensitiveContains(next) {
        return previous
    }

    let maxOverlap = min(previous.count, next.count)
    if maxOverlap > 0 {
        for size in stride(from: maxOverlap, through: 1, by: -1) {
            let previousTail = String(previous.suffix(size)).lowercased()
            let nextHead = String(next.prefix(size)).lowercased()

            if previousTail == nextHead {
                return "\(previous) \(next.dropFirst(size))".trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
    }

    return "\(previous) \(next)".trimmingCharacters(in: .whitespacesAndNewlines)
}

enum DictationFailure: LocalizedError {
    case speechUnavailable
    case speechDenied
    case speechRestricted
    case microphoneDenied
    case recognizerMissing

    var code: String {
        switch self {
        case .speechUnavailable:
            return "speech-unavailable"
        case .speechDenied:
            return "speech-denied"
        case .speechRestricted:
            return "speech-restricted"
        case .microphoneDenied:
            return "microphone-denied"
        case .recognizerMissing:
            return "recognizer-missing"
        }
    }

    var errorDescription: String? {
        switch self {
        case .speechUnavailable:
            return "Speech recognition is unavailable right now."
        case .speechDenied:
            return "Speech recognition permission was denied."
        case .speechRestricted:
            return "Speech recognition is restricted on this Mac."
        case .microphoneDenied:
            return "Microphone permission was denied."
        case .recognizerMissing:
            return "A speech recognizer could not be created for this language."
        }
    }
}

@MainActor
final class DictationSession {
    private let audioEngine = AVAudioEngine()
    private let recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
    private let recognizer: SFSpeechRecognizer
    private var recognitionTask: SFSpeechRecognitionTask?
    private var stopContinuation: CheckedContinuation<Void, Never>?
    private var stopped = false
    private var committedTranscript = ""
    private var previewTranscript = ""

    init(localeIdentifier: String) throws {
        let locale = Locale(identifier: localeIdentifier)
        if let recognizer = SFSpeechRecognizer(locale: locale) {
            self.recognizer = recognizer
        } else if let recognizer = SFSpeechRecognizer() {
            self.recognizer = recognizer
        } else {
            throw DictationFailure.recognizerMissing
        }
    }

    func start() throws {
        if !recognizer.isAvailable {
            throw DictationFailure.speechUnavailable
        }

        recognitionRequest.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition {
            recognitionRequest.requiresOnDeviceRecognition = true
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        recognitionTask = recognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self else { return }

            if let result {
                let transcript = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)

                if result.isFinal {
                    self.committedTranscript = mergeTranscriptSnapshots(previous: self.committedTranscript, next: transcript)
                    self.previewTranscript = self.committedTranscript
                    emit(DictationEvent(type: "transcript", text: self.committedTranscript, isFinal: true))
                } else {
                    self.previewTranscript = mergeTranscriptSnapshots(previous: self.committedTranscript, next: transcript)
                    emit(DictationEvent(type: "transcript", text: self.previewTranscript, isFinal: false))
                }
            }

            if let error {
                emit(DictationEvent(type: "error", code: "speech-runtime", message: error.localizedDescription))
                self.stop()
            }
        }

        emit(DictationEvent(type: "start"))
    }

    func waitForStop() async {
        await withCheckedContinuation { continuation in
            stopContinuation = continuation
        }
    }

    func stop() {
        if stopped {
            return
        }

        stopped = true
        let finalTranscript = mergeTranscriptSnapshots(previous: committedTranscript, next: previewTranscript)
        if !finalTranscript.isEmpty && finalTranscript != committedTranscript {
            committedTranscript = finalTranscript
            emit(DictationEvent(type: "transcript", text: committedTranscript, isFinal: true))
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        recognitionRequest.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        emit(DictationEvent(type: "end"))
        stopContinuation?.resume()
        stopContinuation = nil
    }
}

func requestSpeechAuthorization() async throws {
    let status = await withCheckedContinuation { continuation in
        SFSpeechRecognizer.requestAuthorization { authorizationStatus in
            continuation.resume(returning: authorizationStatus)
        }
    }

    switch status {
    case .authorized:
        return
    case .denied:
        throw DictationFailure.speechDenied
    case .restricted:
        throw DictationFailure.speechRestricted
    case .notDetermined:
        throw DictationFailure.speechUnavailable
    @unknown default:
        throw DictationFailure.speechUnavailable
    }
}

func requestMicrophoneAccess() async throws {
    let granted = await withCheckedContinuation { continuation in
        AVCaptureDevice.requestAccess(for: .audio) { allowed in
            continuation.resume(returning: allowed)
        }
    }

    if !granted {
        throw DictationFailure.microphoneDenied
    }
}

func listenForStopCommand(session: DictationSession) {
    Task.detached {
        let input = FileHandle.standardInput

        for try await byte in input.bytes {
            if byte == UInt8(ascii: "q") || byte == UInt8(ascii: "\n") {
                await MainActor.run {
                    session.stop()
                }
                break
            }
        }
    }
}

@main
struct VergeDictationCLI {
    static func main() async {
        let localeIdentifier = CommandLine.arguments.dropFirst().first ?? Locale.current.identifier

        do {
            try await requestSpeechAuthorization()
            try await requestMicrophoneAccess()

            let session = try await MainActor.run {
                try DictationSession(localeIdentifier: localeIdentifier)
            }

            listenForStopCommand(session: session)

            try await MainActor.run {
                try session.start()
            }

            await session.waitForStop()
        } catch {
            let nsError = error as NSError
            let code = (error as? DictationFailure)?.code ?? String(nsError.code)
            emit(
                DictationEvent(
                    type: "error",
                    code: code,
                    message: error.localizedDescription
                )
            )
            emit(DictationEvent(type: "end"))
        }
    }
}
