# LibreQoS Bufferbloat Test - Systemd Service Setup

This document provides instructions for setting up the LibreQoS Bufferbloat Test as a systemd service on Ubuntu Server.

## Installation Steps

1. Copy the service file to the systemd directory:

```bash
sudo cp libreqos-bufferbloat.service /etc/systemd/system/
```

2. Reload the systemd daemon to recognize the new service:

```bash
sudo systemctl daemon-reload
```

3. Enable the service to start automatically on boot:

```bash
sudo systemctl enable libreqos-bufferbloat.service
```

4. Start the service:

```bash
sudo systemctl start libreqos-bufferbloat.service
```

5. Check the service status:

```bash
sudo systemctl status libreqos-bufferbloat.service
```

## Managing the Service

### Stopping the Service

```bash
sudo systemctl stop libreqos-bufferbloat.service
```

### Restarting the Service

```bash
sudo systemctl restart libreqos-bufferbloat.service
```

### Viewing Service Logs

```bash
sudo journalctl -u libreqos-bufferbloat.service
```

To follow logs in real-time:

```bash
sudo journalctl -u libreqos-bufferbloat.service -f
```

## Troubleshooting

If the service fails to start, check the logs for errors:

```bash
sudo journalctl -u libreqos-bufferbloat.service -n 50
```

Common issues:
- Incorrect file paths in the service file
- Missing dependencies
- Permission issues

## Service Configuration

The service is configured to:
- Run as the root user
- Automatically restart if it crashes
- Start after the network is available
- Log output to the system journal

If you need to modify the service configuration, edit the service file and reload the daemon:

```bash
sudo nano /etc/systemd/system/libreqos-bufferbloat.service
sudo systemctl daemon-reload
sudo systemctl restart libreqos-bufferbloat.service
```

## Accessing the Application

Once the service is running, you can access the LibreQoS Bufferbloat Test at:

```
http://your-server-ip:80/
```

Replace `your-server-ip` with the IP address of your server.