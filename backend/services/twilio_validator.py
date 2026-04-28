import os
from fastapi import Request, HTTPException
from twilio.request_validator import RequestValidator


async def verify_twilio_signature(request: Request):
    """Dependency - raises 403 if request is not from Twilio."""
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "")

    # Skip in local dev or if token not set
    if not auth_token or os.environ.get("ENV") == "development":
        return

    signature = request.headers.get("X-Twilio-Signature", "")
    form_data = dict(await request.form())

    # Railway sits behind a proxy - reconstruct the real URL Twilio signed
    proto = request.headers.get("x-forwarded-proto", "https")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    url = f"{proto}://{host}{request.url.path}" if host else str(request.url)

    validator = RequestValidator(auth_token)
    if not validator.validate(url, form_data, signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")
