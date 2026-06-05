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

module.exports = {
  target: 'webworker',
  entry: './index.js',
  output: {
    filename: 'worker.js',
    path: path.resolve(__dirname, 'dist')
  },
  ...htmlRule
};
