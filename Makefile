NODE_VERSION := 20.19.0
UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)

ifeq ($(UNAME_S),Darwin)
NODE_PLATFORM := darwin
endif
ifeq ($(UNAME_S),Linux)
NODE_PLATFORM := linux
endif

ifeq ($(UNAME_M),arm64)
NODE_ARCH := arm64
endif
ifeq ($(UNAME_M),aarch64)
NODE_ARCH := arm64
endif
ifeq ($(UNAME_M),x86_64)
NODE_ARCH := x64
endif

ifeq ($(NODE_PLATFORM),)
$(error Unsupported platform "$(UNAME_S)". Use Node >= 20.9 manually on this machine.)
endif

ifeq ($(NODE_ARCH),)
$(error Unsupported architecture "$(UNAME_M)". Use Node >= 20.9 manually on this machine.)
endif

NODE_DIST := node-v$(NODE_VERSION)-$(NODE_PLATFORM)-$(NODE_ARCH)
NODE_ARCHIVE := $(NODE_DIST).tar.gz
NODE_URL := https://nodejs.org/dist/v$(NODE_VERSION)/$(NODE_ARCHIVE)
TOOLS_DIR := .tools
NODE_DIR := $(TOOLS_DIR)/$(NODE_DIST)
NODE_BIN := $(NODE_DIR)/bin/node
NPM_BIN := $(NODE_DIR)/bin/npm

.PHONY: help setup node install dev lint build-next clean-node node-version

help:
	@echo "Verge local toolchain commands:"
	@echo "  make setup       Download local Node $(NODE_VERSION) and install npm deps"
	@echo "  make dev         Start Verge using the local Node toolchain"
	@echo "  make lint        Run eslint with the local Node toolchain"
	@echo "  make build-next  Run the Next.js production build with the local Node toolchain"
	@echo "  make clean-node  Remove the downloaded local Node toolchain"

$(NODE_BIN):
	@mkdir -p $(TOOLS_DIR)
	@echo "Downloading Node $(NODE_VERSION) for $(NODE_PLATFORM)-$(NODE_ARCH)..."
	@curl -fsSL "$(NODE_URL)" -o "$(TOOLS_DIR)/$(NODE_ARCHIVE)"
	@tar -xzf "$(TOOLS_DIR)/$(NODE_ARCHIVE)" -C "$(TOOLS_DIR)"
	@rm -f "$(TOOLS_DIR)/$(NODE_ARCHIVE)"

node: $(NODE_BIN)

install: node
	@"$(NPM_BIN)" install

setup: install

dev: node
	@"$(NPM_BIN)" run dev

lint: node
	@"$(NPM_BIN)" run lint

build-next: node
	@"$(NPM_BIN)" run build:next

node-version: node
	@"$(NODE_BIN)" -v

clean-node:
	@rm -rf "$(NODE_DIR)"
