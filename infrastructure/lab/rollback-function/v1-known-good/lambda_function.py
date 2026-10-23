"""
aicoe-lab-rollback-function - version 1, the known-good release.

Published once and never changed: a Lambda version is immutable, which is what makes
"roll back to version 1" a promise rather than a hope.

The handler reports its own release name. That is what lets verification prove which
code answered, independently of what the alias claims to point at - a pointer can be
read, but only an invocation can tell you what is actually serving.

It computes a small deterministic result so the regression in version 2 has something
concrete to get wrong, and it has no side effects at all: no writes, no network, no
environment reads. Safe to invoke as a probe.
"""

import json

RELEASE = "v1-known-good"

# A fixed basket, so the arithmetic is reproducible and the probe needs no input.
BASKET = [{"sku": "A-100", "qty": 2, "unit_pence": 1250},
          {"sku": "B-220", "qty": 1, "unit_pence": 899}]


def _total_pence(basket):
    return sum(line["qty"] * line["unit_pence"] for line in basket)


def lambda_handler(event, context):
    total = _total_pence(BASKET)
    return {
        "statusCode": 200,
        "body": json.dumps({
            "ok": True,
            "release": RELEASE,
            "basket_lines": len(BASKET),
            "total_pence": total,
        }),
    }
