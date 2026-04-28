"""ASHA - Twilio WhatsApp Service"""

import os
from twilio.rest import Client

def get_client() -> Client:
    return Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])

def send_whatsapp(to: str, body: str) -> None:
    """
    Send a WhatsApp message.
    `to` must be in format: whatsapp:+254712345678
    Twilio Sandbox number is +14155238886.
    """
    client = get_client()
    from_number = os.environ.get("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")

    # WhatsApp messages max 1600 chars - split if needed
    chunks = [body[i:i+1500] for i in range(0, len(body), 1500)]

    for chunk in chunks:
        client.messages.create(
            from_=from_number,
            to=to,
            body=chunk,
        )
