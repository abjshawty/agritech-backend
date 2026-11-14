FROM oven/bun:1.3.10-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY tsconfig.json ./
COPY src ./src
COPY data ./data
ENV PORT=3000 SERVER_PATH=/api
EXPOSE 3000
USER bun
CMD ["bun", "src/index.ts"]
