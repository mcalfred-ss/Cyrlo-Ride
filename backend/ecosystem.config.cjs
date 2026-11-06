/**
 * One API process. Socket.IO is attached to this process.
 * Do not raise instances above 1 until a Socket.IO adapter and sticky sessions exist.
 * Secrets come from the server environment, not from this file.
 */
module.exports = {
  apps: [
    {
      name: 'cyrlo-ride-api',
      cwd: '/var/www/cyrlo-ride/backend',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
