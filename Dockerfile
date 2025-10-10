# Build stage
FROM ghcr.io/cirruslabs/flutter:3.35.4 AS build
WORKDIR /app

# Copy the project
COPY . .

# Get dependencies
RUN flutter pub get

# Build APK
RUN flutter build apk --release

# Runtime stage
FROM alpine:latest
WORKDIR /app

# Install bash
RUN apk add --no-cache bash

# Copy APK to mounted folder
COPY --from=build /app/build/app/outputs/flutter-apk/app-release.apk /app/output/app-release.apk

# Update script
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'echo "Flutter APK is built and available at /app/output/app-release.apk"' >> /app/start.sh && \
    chmod +x /app/start.sh

CMD ["/app/start.sh"]
