# 9Router

Default configuration:

```env
NINE_ROUTER_BASE_URL=http://127.0.0.1:20128/v1
NINE_ROUTER_API_KEY=
NINE_ROUTER_TEXT_MODEL=
NINE_ROUTER_IMAGE_MODEL=
NINE_ROUTER_VIDEO_MODEL=
NINE_ROUTER_TTS_MODEL=
NINE_ROUTER_STT_MODEL=
```

The app sends OpenAI-compatible requests to the configured endpoint. It does not manage upstream accounts, rotate keys, or assume every model supports every endpoint.

Supported capability probes:

- `GET /v1/models`
- Standard image generation response parsing: `data[].url`, `data[].b64_json`
- Chat image response parsing: `choices[].message.images`
- Data URI extraction from message content

Connection tests must warn before paid capabilities are exercised.

