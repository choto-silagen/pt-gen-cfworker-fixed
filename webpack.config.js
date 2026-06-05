const path = require("path");

const htmlRule = {
  module: {
    rules: [
      {
        test: /\.html$/i,
        loader: "html-loader",
        options: {
          sources: false,
          esModule: true
        }
      },
    ],
  },
};

module.exports = [
  {
    name: "worker",
    target: 'webworker',
    entry: './index.js',
    output: {
      filename: 'worker.js',
      path: path.resolve(__dirname, 'dist')
    },
    ...htmlRule
  },
  {
    name: "server",
    target: 'node18',
    entry: './server.js',
    output: {
      filename: 'server.cjs',
      path: path.resolve(__dirname, 'dist')
    },
    experiments: {
      outputModule: false
    },
    ...htmlRule
  }
];
