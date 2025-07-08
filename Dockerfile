FROM node:20

WORKDIR /app

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

COPY . .

RUN npm install

# Optional: build if needed
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

EXPOSE 5000

CMD ["npm", "start"]