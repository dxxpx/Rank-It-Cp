# Build stage
FROM cirrusci/flutter:stable AS build

WORKDIR /app

# Copy pubspec files
COPY pubspec.yaml ./
RUN flutter pub get

# Copy source code and build
COPY . .
RUN flutter build apk --release

# Runtime stage
FROM alpine:latest

# Install necessary runtime dependencies
RUN apk add --no-cache bash

# Copy built APK from build stage
COPY --from=build /app/build/app/outputs/flutter-apk/app-release.apk /app/app-release.apk

# Create a simple script to serve the APK
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'echo "Flutter APK is built and available at /app/app-release.apk"' >> /app/start.sh && \
    echo 'echo "You can extract it using: docker cp <container_id>:/app/app-release.apk ."' >> /app/start.sh && \
    chmod +x /app/start.sh

WORKDIR /app
CMD ["/app/start.sh"]