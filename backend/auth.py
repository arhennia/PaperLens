"""Service-token authentication for the internal API boundary (D-021).

This service verifies **callers, not users**. Next.js authenticates the person,
authorizes the folder against RLS, and only then calls here with a shared bearer
token. So the token means exactly one thing: "a trusted caller has already
authorized this work."

That is a much smaller thing to get right than a second, parallel notion of user
identity — which would mean two authorization implementations, in two languages,
that must agree forever. It is also why ``SUPABASE_JWT_SECRET`` is retired
(D-019): nothing here verifies end-user JWTs.

The honest tradeoff: one shared secret, so leaking it lets anyone enqueue
processing. Contained by keeping this service off the public internet where the
platform allows it, and by job payloads referencing server-side identifiers
rather than carrying data.
"""

import secrets

from fastapi import Header, HTTPException, status

from backend.config import PROCESSING_SERVICE_TOKEN


def verify_service_token(authorization: str | None = Header(default=None)) -> None:
    """FastAPI dependency that rejects any caller without the service token.

    Args:
        authorization: The ``Authorization`` header, expected as
            ``Bearer <token>``.

    Raises:
        HTTPException: 500 if the service has no token configured, 401 for a
            missing, malformed, or incorrect one.
    """
    # An unconfigured token must never mean "allow everyone". Failing closed with
    # a 500 makes a misconfigured deployment obvious instead of silently open.
    if not PROCESSING_SERVICE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PROCESSING_SERVICE_TOKEN is not configured on this service.",
        )

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must be 'Bearer <token>'.",
        )

    # compare_digest, not ==. A plain comparison short-circuits on the first
    # differing byte, so response timing would leak the token prefix and make it
    # guessable one character at a time.
    if not secrets.compare_digest(token, PROCESSING_SERVICE_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service token.",
        )
