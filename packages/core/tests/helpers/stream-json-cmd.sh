#!/bin/sh
# Emits realistic Claude Code stream-json NDJSON output.
# Simulates: init → tool_use (Read) → text streaming → assistant → result

# system init
echo '{"type":"system","subtype":"init","session_id":"test-session-123","tools":["Read","Bash"]}'

# stream_event: content_block_start with tool_use
echo '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_123","name":"Read","input":{}}}}'

# stream_event: input_json_delta for tool input
echo '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"file_path\":\"/tmp/test.txt\"}"}}}'

# stream_event: content_block_stop (tool call complete)
echo '{"type":"stream_event","event":{"type":"content_block_stop","index":0}}'

# stream_event: content_block_start with text
echo '{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}}'

# stream_event: text_delta chunks
echo '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"The project "}}}'
echo '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"name is "}}}'
echo '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"telegramable."}}}'

# stream_event: content_block_stop
echo '{"type":"stream_event","event":{"type":"content_block_stop","index":1}}'

# assistant complete message
echo '{"type":"assistant","message":{"id":"msg_123","role":"assistant","content":[{"type":"tool_use","id":"toolu_123","name":"Read","input":{"file_path":"/tmp/test.txt"}},{"type":"text","text":"The project name is telegramable."}]},"session_id":"test-session-123"}'

# result
echo '{"type":"result","subtype":"success","is_error":false,"result":"The project name is telegramable.","session_id":"test-session-123","total_cost_usd":0.01}'
