"""aicoe-lab-error-function

Deliberately failing workload for the AI Cloud Operations Engineer lab.

The function needs two settings to reach its (simulated) downstream dependency.
Neither is configured, so every invocation fails the same way: a structured
error log naming exactly what is missing, followed by a ConfigurationError.

Deterministic on purpose - the future agent should be able to read the logs,
name the root cause, and fix it by setting the variables.
"""

import json
import logging
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SERVICE = "aicoe-lab"
REQUIRED_SETTINGS = ("DOWNSTREAM_ENDPOINT", "DOWNSTREAM_API_KEY")


class ConfigurationError(RuntimeError):
    """Raised when the function is missing configuration it cannot run without."""


def missing_settings():
    return [name for name in REQUIRED_SETTINGS if not os.environ.get(name)]


def lambda_handler(event, context):
    path = event.get("rawPath") or event.get("path") or "direct-invoke"
    logger.info(json.dumps({
        "event": "request_received",
        "service": SERVICE,
        "path": path,
        "request_id": context.aws_request_id,
    }))

    missing = missing_settings()
    if missing:
        logger.error(json.dumps({
            "event": "configuration_error",
            "service": SERVICE,
            "missing_environment_variables": missing,
            "remediation": "set the listed environment variables on the function configuration",
        }))
        raise ConfigurationError(
            f"{SERVICE}: required environment variables are not configured: {', '.join(missing)}"
        )

    logger.info(json.dumps({"event": "request_succeeded", "service": SERVICE}))
    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps({"status": "ok", "service": SERVICE}),
    }
