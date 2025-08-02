.PHONY: build clean test

build:
	go build -o qoder-cli main.go

clean:
	rm -f qoder-cli

test:
	go test ./...

install-deps:
	go mod tidy

dev: install-deps build