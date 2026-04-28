"""ASHA - LLM Service (Groq)"""

import os
from groq import Groq

# Fast model for all conversational agent responses
FAST   = "llama-3.3-70b-versatile"
# Same model for referral letters - Groq is fast enough
SONNET = "llama-3.3-70b-versatile"

def get_client() -> Groq:
    return Groq(api_key=os.environ["GROQ_API_KEY"])


def call_agent(system_prompt: str, history: list, user_message: str,
               model: str = FAST, max_tokens: int = 500) -> str:
    client   = get_client()
    messages = [{"role": "system", "content": system_prompt}]

    for msg in history[-20:]:
        role    = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(
        model      = model,
        messages   = messages,
        max_tokens = max_tokens,
    )
    return response.choices[0].message.content


def call_sonnet(system_prompt: str, user_message: str,
                max_tokens: int = 1000) -> str:
    """Referral letter generation - uses same fast model."""
    return call_agent(system_prompt, [], user_message,
                      model=SONNET, max_tokens=max_tokens)