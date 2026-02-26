const express = require('express');

const app = express();
const PORT = process.env.PORT || ${{ values.port }};

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ service: '${{ values.name }}', status: 'ok' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`${{ values.name }} listening on port ${PORT}`);
});
