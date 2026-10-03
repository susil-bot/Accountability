FROM postgres:16-alpine
RUN apk add --no-cache rclone tzdata
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh \
 && echo "15 3 * * * /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
# Run once at start (so a fresh install has a backup immediately), then daily at 03:15 UTC.
CMD ["sh", "-c", "/usr/local/bin/backup.sh; exec crond -f -l 8"]
