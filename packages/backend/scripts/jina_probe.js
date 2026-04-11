async function run() {
  const url =
    process.argv[2] ||
    'https://r.jina.ai/http://www.idealista.it/geo/vendita-case/via-benedetto-croce-pescara-pescara/';
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  });
  const text = await response.text();
  console.log(
    JSON.stringify(
      {
        status: response.status,
        length: text.length,
        sample: text.slice(0, 900)
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
