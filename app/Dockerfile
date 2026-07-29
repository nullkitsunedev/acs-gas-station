FROM node:20-slim

RUN apt-get update && apt-get install -y \
    cron sudo curl net-tools procps bash php-cli sqlite3 libxml2-utils \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json .
RUN npm install
COPY . .

# Create empty directories only — all content written at runtime
RUN mkdir -p /app/data /app/uploads /var/www /opt /var/log /etc/acs-gas-station /app/templates

RUN chown -R node:node /app/data /app/uploads
RUN chmod +x /app/scripts/start.sh

EXPOSE 3000
CMD ["/app/scripts/start.sh"]
