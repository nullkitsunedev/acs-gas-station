# ACS Gas Station - Arena Web Security

"ACS Gas Station - Fuel Distribution & Gas Station Management Platform"  
A realistic Docker-based lab designed for penetration testing training.  
Difficulty: Beginner -> Advanced (OSCP-style).

## Setup Instructions (For Students)

This lab is fully containerized using Docker. You do **not** need to download any source code or files from GitHub. Just ensure you have [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed on your computer.

### 1. Install & Run the Lab
Open your terminal (or Command Prompt/PowerShell) and run the following command:

```bash
docker run -d --name acs-gas-station -p 8090:3000 ghcr.io/s4mc71/acs-gas-station:latest
```
*Note: The first time you run this, it will take a few minutes to download the files from the internet.*

### 2. Access the Lab
Once the container is running, open your web browser and go to:
👉 **[http://localhost:8090](http://localhost:8090)**

### 3. Stop the Lab (Pause)
When you are done practicing and want to turn off the lab to save PC resources, run:
```bash
docker stop acs-gas-station
```

### 4. Start the Lab Again
To start the lab again later (it will start instantly without downloading), run:
```bash
docker start acs-gas-station
```

### 5. Remove the Lab (Delete)
If you want to completely delete the lab from your computer, run:
```bash
docker rm -f acs-gas-station
```

## Features
- Fully functional Gas Station dashboard
- 12+ embedded vulnerabilities (OWASP Top 10)
- Designed for realistic penetration testing training

Enjoy the lab!
