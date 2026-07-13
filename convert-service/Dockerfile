FROM node:20-bullseye-slim

# Install LibreOffice (Writer/Impress/Calc/Draw) and fonts needed for
# high-fidelity conversion in both directions (Office <-> PDF). PDF import is
# built into Draw/Impress/core in this LibreOffice version - no separate
# libreoffice-pdfimport package exists in Debian bullseye.
RUN apt-get update && apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-impress \
    libreoffice-calc \
    libreoffice-draw \
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
