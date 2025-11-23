FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci

# Install Chromium deps + Chromium itself
RUN apt-get update && apt-get install -y \
  chromium \
  libglib2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libnss3 libxss1 \
  libasound2 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
  libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 \
  libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libgbm1 \
  libpango-1.0-0 libpangocairo-1.0-0 fonts-liberation \
  ca-certificates xdg-utils wget \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Tell puppeteer-core to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY . .
CMD ["npm","start"]
