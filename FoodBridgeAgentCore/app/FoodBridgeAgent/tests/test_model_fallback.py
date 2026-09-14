import asyncio
import os
import unittest
from unittest import mock

os.environ.setdefault("GLM_API_KEY", "test-placeholder")
os.environ.setdefault("GROQ_API_KEY", "test-placeholder")

import main
from model.load import is_provider_unavailable_error, load_model


class FailingAgent:
    def __init__(self, message: str):
        self.message = message

    async def invoke_async(self, prompt: str):
        raise RuntimeError(self.message)


class WorkingAgent:
    async def invoke_async(self, prompt: str):
        return {"prompt": prompt}


class ModelResponse:
    message = {
        "content": [
            {"reasoningContent": {"reasoningText": {"text": "internal"}}},
            {"text": "FoodBridge is ready"},
        ]
    }


class ModelFallbackTests(unittest.TestCase):
    def setUp(self):
        self.original_resolve_agent = main.resolve_agent

    def tearDown(self):
        main.resolve_agent = self.original_resolve_agent

    def use_agents(self, agents):
        async def resolve(provider):
            return agents.get(provider)

        main.resolve_agent = resolve

    def test_provider_configuration(self):
        bedrock_model = load_model("bedrock")
        self.assertEqual(bedrock_model.config["model_id"], "us.amazon.nova-micro-v1:0")
        self.assertEqual(bedrock_model.client.meta.config.retries["total_max_attempts"], 1)
        self.assertEqual(load_model("glm").config["model_id"], "glm-5.1")
        groq_model = load_model("groq")
        self.assertEqual(groq_model.config["model_id"], "openai/gpt-oss-20b")
        self.assertEqual(groq_model.client_args["base_url"], "https://api.groq.com/openai/v1")

    def test_agentcore_local_groq_credential_is_supported(self):
        with mock.patch.dict(
            os.environ,
            {
                "GROQ_API_KEY": "",
                "AGENTCORE_CREDENTIAL_FOODBRIDGE_GROQ": "test-placeholder",
            },
            clear=False,
        ):
            self.assertEqual(load_model("groq").config["model_id"], "openai/gpt-oss-20b")

    def test_groq_is_primary(self):
        self.use_agents({"groq": WorkingAgent()})

        response, provider, fallback_used = asyncio.run(
            main.run_agent("Coordinate 60 meals")
        )

        self.assertEqual(response, {"prompt": "Coordinate 60 meals"})
        self.assertEqual(provider, "groq")
        self.assertFalse(fallback_used)

    def test_rate_limited_groq_uses_glm(self):
        self.use_agents({
            "groq": FailingAgent("RateLimitError: status code: 429"),
            "glm": WorkingAgent(),
        })

        response, provider, fallback_used = asyncio.run(main.run_agent("Coordinate 60 meals"))

        self.assertEqual(response, {"prompt": "Coordinate 60 meals"})
        self.assertEqual(provider, "glm")
        self.assertTrue(fallback_used)

    def test_bedrock_is_final_fallback(self):
        self.use_agents({
            "groq": FailingAgent("APITimeoutError: Groq timed out"),
            "glm": FailingAgent("APIConnectionError: Z.AI unavailable"),
            "bedrock": WorkingAgent(),
        })

        response, provider, fallback_used = asyncio.run(main.run_agent("Coordinate 60 meals"))

        self.assertEqual(response, {"prompt": "Coordinate 60 meals"})
        self.assertEqual(provider, "bedrock")
        self.assertTrue(fallback_used)

    def test_non_provider_error_is_not_retried(self):
        self.use_agents({
            "groq": FailingAgent("tool validation failed"),
            "glm": WorkingAgent(),
        })

        with self.assertRaisesRegex(RuntimeError, "tool validation failed"):
            asyncio.run(main.run_agent("Coordinate 60 meals"))

    def test_error_classification(self):
        self.assertTrue(
            is_provider_unavailable_error(
                RuntimeError("AccessDeniedException: model quota unavailable")
            )
        )
        self.assertFalse(
            is_provider_unavailable_error(RuntimeError("recipient capacity invalid"))
        )

    def test_bedrock_timeout_uses_fallback(self):
        self.assertTrue(
            is_provider_unavailable_error(
                RuntimeError('Read timeout on endpoint URL: "https://bedrock-runtime.us-west-2.amazonaws.com"')
            )
        )

    def test_response_text_skips_reasoning_blocks(self):
        self.assertEqual(
            main.extract_response_text(ModelResponse()),
            "FoodBridge is ready",
        )


if __name__ == "__main__":
    unittest.main()
