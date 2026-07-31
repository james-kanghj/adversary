# adversary - CLI usage demo (a VHS tape)
#
# Renders a typed-out terminal session to a GIF and an MP4. To produce it:
#   brew install vhs            # or: go install github.com/charmbracelet/vhs@latest
#   vhs examples/demo.tape      # writes examples/demo.gif and examples/demo.mp4
#
# Everything runs in a throwaway temp dir against the published package, so the
# recording is reproducible and clean.

Output examples/demo.gif
Output examples/demo.mp4

Set Shell bash
Set FontSize 18
Set Width 1200
Set Height 760
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms

# --- hidden setup: temp dir + install the published package + write a schema ---
Hide
Type "cd $(mktemp -d)" Enter
Type "npm init -y >/dev/null 2>&1; npm pkg set type=module >/dev/null 2>&1; npm install adversary zod >/dev/null 2>&1" Enter
Type "cat > signup.ts <<'EOF'" Enter
Type "import { z } from 'zod'" Enter
Type "export default z.object({" Enter
Type "  username: z.string().min(3).max(20)," Enter
Type "  age: z.number().int().min(18)," Enter
Type "  email: z.email()," Enter
Type "})" Enter
Type "EOF" Enter
Type "clear" Enter
Show

# --- the demo ---
Sleep 600ms
Type "# 1. a normal Zod schema" Enter
Sleep 700ms
Type "cat signup.ts" Enter
Sleep 2500ms

Type "# 2. adversary turns it into explained adversarial inputs" Enter
Sleep 700ms
Type "npx adversary signup.ts --report | head -26" Enter
Sleep 5s

Type "# 3. every value says WHY it might break - filter to the email field's injection cases" Enter
Sleep 700ms
Type "npx adversary signup.ts --report --field email | head -24" Enter
Sleep 5s

Type "# 4. JSON out for a test.each table (technique/family/validity labels)" Enter
Sleep 700ms
Type "npx adversary signup.ts --technique injection --field username | head -18" Enter
Sleep 5s

Type "# validation is not safety - each case is a hypothesis to check." Enter
Sleep 2500ms
