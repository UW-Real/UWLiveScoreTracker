const express = require('express');
const Router = express.Router();

Router.get('/', async (req, res) => {
  const { user_id } = req.query;
  return res.status(200).json({ score: 100 });
});

module.exports = { Router };