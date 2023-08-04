const express = require('express');
const cors = require('cors');
require('dotenv').config()

// create express app
const app = express();

// use cors middleware
app.use(cors());

// enable express to parse json body data
app.use(express.json());

const linearRoutes = require('./routes/linear');
const openAIRoutes = require('./routes/openai');

app.use('/linear', linearRoutes);
app.use('/openai', openAIRoutes);

// create route
app.get('/', (req, res) => {
  res.send('Hello, World!');
});

// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
