#!/bin/sh
# Emits realistic Claude Code stream-json NDJSON output with subagent events.
# Simulates: init → Agent tool_use → subagent tool calls (with parent_tool_use_id) → text → result

# system init
echo '{"type":"system","subtype":"init","session_id":"test-session-789","tools":["Read","Bash","Agent"]}'

# Parent: content_block_start with Agent tool_use
echo '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_agent_1","name":"Agent","input":{}}}}'

# Parent: Agent tool input
echo '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"prompt\":\"Review the code\",\"description\":\"Code review\"}"}}}'

# Parent: content_block_stop (Agent tool call complete, subagent starts executing)
echo '{"type":"stream_event","event":{"type":"content_block_stop","index":0}}'

# Subagent: tool_use for Read (note parent_tool_use_id at top level)
echo '{"type":"stream_event","parent_tool_use_id":"toolu_agent_1","event":{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_sub_1","name":"Read","input":{}}}}'

echo '{"type":"stream_event","parent_tool_use_id":"toolu_agent_1","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"file_path\":\"src/auth.ts\"}"}}}'

echo '{"type":"stream_event","parent_tool_use_id":"toolu_agent_1","event":{"type":"content_block_stop","index":0}}'

# Subagent: tool_use for Grep
echo '{"type":"stream_event","parent_tool_use_id":"toolu_agent_1","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_sub_2","name":"Grep","input":{}}}}'

echo '{"type":"stream_event","parent_tool_use_id":"toolu_agent_1","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"pattern\":\"TODO\"}"}}}'

echo '{"type":"stream_event","parent_tool_use_id":"toolu_agent_1","event":{"type":"content_block_stop","index":1}}'

# Subagent: text output (intermediate, should have parent_tool_use_id)
echo '{"type":"stream_event","parent_tool_use_id":"toolu_agent_1","event":{"type":"content_block_start","index":2,"content_block":{"type":"text","text":""}}}'

echo '{"type":"stream_event","parent_tool_use_id":"toolu_agent_1","event":{"type":"content_block_delta","index":2,"delta":{"type":"text_delta","text":"Found 3 issues."}}}'

echo '{"type":"stream_event","parent_tool_use_id":"toolu_agent_1","event":{"type":"content_block_stop","index":2}}'

# Parent: text response (no parent_tool_use_id)
echo '{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}}'

echo '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"The review found 3 issues."}}}'

echo '{"type":"stream_event","event":{"type":"content_block_stop","index":1}}'

# assistant complete message
echo '{"type":"assistant","message":{"id":"msg_789","role":"assistant","content":[{"type":"tool_use","id":"toolu_agent_1","name":"Agent","input":{"prompt":"Review the code","description":"Code review"}},{"type":"text","text":"The review found 3 issues."}]},"session_id":"test-session-789"}'

# result
echo '{"type":"result","subtype":"success","is_error":false,"result":"The review found 3 issues.","session_id":"test-session-789","total_cost_usd":0.05}'
