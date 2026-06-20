const resp = await fetch('http://localhost:11434/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
  body: JSON.stringify({
    model: 'qwen2.5:7b',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'say hi' },
    ],
    max_tokens: 50,
    stream: false,
    tools: [],
    tool_choice: 'auto',
  }),
});
console.log('Status:', resp.status);
const data = await resp.json();
console.log('Response:', JSON.stringify(data.choices?.[0]?.message?.content));
