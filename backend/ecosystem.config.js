module.exports = {
  apps: [{
    name: 'karoalert-backend',
    script: 'server.js',
    cwd: '/var/www/karoalert-backend',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    error_file: '/var/log/karoalert/error.log',
    out_file: '/var/log/karoalert/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
    restart_delay: 3000
  }]
};