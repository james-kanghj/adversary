# adversary - OpenAPI demo (a VHS tape)
#
# Renders the "start from an API spec, no Zod schema" flow to a GIF and MP4:
#   brew install vhs                 # or: go install github.com/charmbracelet/vhs@latest
#   vhs examples/openapi-demo.tape   # writes examples/openapi-demo.gif and .mp4
#
# Everything runs in a throwaway temp dir against the published package, so the
# recording is reproducible and clean. Needs adversary >= 1.1.0.

Output examples/openapi-demo.gif
Output examples/openapi-demo.mp4

Set Shell bash
Set FontSize 18
Set Width 1200
Set Height 760
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms

# --- hidden setup: temp dir + install the published package + write a spec ---
Hide
Type "cd $(mktemp -d)" Enter
Type "npm init -y >/dev/null 2>&1; npm install adversary yaml >/dev/null 2>&1" Enter
Type "cat > openapi.yaml <<'EOF'" Enter
Type "openapi: 3.0.3" Enter
Type "info: { title: Payments API, version: '1.0.0' }" Enter
Type "paths:" Enter
Type "  /webhooks:" Enter
Type "    post:" Enter
Type "      requestBody:" Enter
Type "        content:" Enter
Type "          application/json:" Enter
Type "            schema:" Enter
Type "              type: object" Enter
Type "              required: [callbackUrl]" Enter
Type "              properties:" Enter
Type "                callbackUrl: { type: string, format: uri }" Enter
Type "  /users/{id}:" Enter
Type "    get:" Enter
Type "      parameters:" Enter
Type "        - name: id" Enter
Type "          in: path" Enter
Type "          required: true" Enter
Type "          schema: { type: string, format: uuid }" Enter
Type "EOF" Enter
Type "clear" Enter
Show

# --- the demo ---
Sleep 600ms
Type "# 1. just an OpenAPI spec - two operations, no Zod schema, no code" Enter
Sleep 700ms
Type "cat openapi.yaml" Enter
Sleep 3s

Type "# 2. adversary reads each operation and explains the hostile inputs" Enter
Sleep 700ms
Type "npx adversary openapi.yaml --report | head -22" Enter
Sleep 5s

Type "# 3. the spec's format: uuid drives format-specific cases on the id param" Enter
Sleep 700ms
Type "npx adversary openapi.yaml --report --technique EP --field id | head -14" Enter
Sleep 5s

Type "# validation is not safety - each case is a hypothesis to check." Enter
Sleep 2500ms
