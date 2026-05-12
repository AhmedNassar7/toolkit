FROM node:20.12.2-slim

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]