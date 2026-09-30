"""aicoe-lab-function

Intentionally trivial workload for the AI Cloud Operations Engineer lab.
Returns a deterministic payload so validation and drift checks stay simple.
"""

RESPONSE = {"status": "ok", "service": "aicoe-lab"}


def lambda_handler(event, context):
    return dict(RESPONSE)

# lab padding   
