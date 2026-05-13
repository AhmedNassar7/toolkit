FROM node:20-bullseye-slim

# Install LibreOffice, fonts, and essentials for proper DOCX to PDF conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-common \
    libreoffice-core \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-cjk \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package.json package.json
RUN npm install --production
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
