# adversary applied to a real FastAPI project (frameboard) - a VHS tape.
# Renders the "point adversary at my Pydantic model" flow.
#   vhs examples/frameboard-demo.tape
# Everything runs in a throwaway temp dir against the published package.
# frameboard (github.com/james-kanghj/frameboard) is a public MIT project.

Output examples/frameboard-demo.gif
Output examples/frameboard-demo.mp4

Set Shell bash
Set FontSize 18
Set Width 1200
Set Height 760
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms

# --- hidden setup: temp dir + pydantic + adversary + the real DTO ---
Hide
Type "cd $(mktemp -d)" Enter
Type "python3 -m venv .venv && source .venv/bin/activate && pip install -q pydantic >/dev/null 2>&1" Enter
Type "npm init -y >/dev/null 2>&1 && npm install adversary >/dev/null 2>&1" Enter
Type "cat > rice.py <<'PY'" Enter
Type "# frameboard/apps/api/app/schemas/prioritization.py (excerpt)" Enter
Type "from typing import Literal" Enter
Type "from uuid import UUID" Enter
Type "from pydantic import BaseModel, Field" Enter
Type "class RICEScoreRequest(BaseModel):" Enter
Type "    item_id: UUID" Enter
Type "    reach: float = Field(..., ge=0)" Enter
Type "    impact: Literal[0.25, 0.5, 1, 2, 3]" Enter
Type "    confidence: float = Field(..., ge=0, le=1)" Enter
Type "    effort: float = Field(..., gt=0)" Enter
Type "PY" Enter
Type "cat > to_schema.py <<'PY'" Enter
Type "import json" Enter
Type "from rice import RICEScoreRequest" Enter
Type "print(json.dumps(RICEScoreRequest.model_json_schema(), indent=2))" Enter
Type "PY" Enter
Type "python to_schema.py > RICEScoreRequest.json" Enter
Type "clear" Enter
Show

# --- the demo ---
Sleep 600ms
Type "# frameboard: the RICE scoring request from my FastAPI API" Enter
Sleep 700ms
Type "cat rice.py" Enter
Sleep 3s

Type "# 1. Pydantic hands over the JSON Schema - bounds, enum and all" Enter
Sleep 700ms
Type "head -16 RICEScoreRequest.json" Enter
Sleep 2500ms

Type "# 2. adversary reads confidence's 0..1 bound and probes the edges" Enter
Sleep 700ms
Type "npx adversary RICEScoreRequest.json --report --field confidence | head -20" Enter
Sleep 5s

Type "# 3. impact is an enum - it even generates 0.75: in range, not a member" Enter
Sleep 700ms
Type "npx adversary RICEScoreRequest.json --report --field impact | head -16" Enter
Sleep 5s

Type "# candidates to verify, not verdicts." Enter
Sleep 2500ms
