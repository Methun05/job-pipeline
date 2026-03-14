import unittest
from unittest.mock import patch, MagicMock
import json

# Actual pipeline modules
from pipeline.filters import experience
from pipeline.dedup import matcher
from pipeline.hunter import _title_rank

class TestPipelineLogic(unittest.TestCase):

    def test_experience_classification(self):
        # 4+ years should be classified as "stretch" (3-5) or "strong" if min < 5
        level, min_y, max_y = experience.classify_experience("Looking for 3-5 years of experience")
        self.assertEqual(level, "stretch")
        self.assertEqual(min_y, 3)
        self.assertEqual(max_y, 5)

        level, min_y, max_y = experience.classify_experience("Requires 10+ years of design")
        self.assertEqual(level, "skip")
        
        level, min_y, max_y = experience.classify_experience("Junior designer wanted")
        self.assertEqual(level, "strong")

    def test_domain_normalization(self):
        self.assertEqual(matcher.normalize_domain("https://www.example.com/careers"), "example.com")
        self.assertEqual(matcher.normalize_domain("app.cryptox.io"), "cryptox.io")
        self.assertEqual(matcher.normalize_domain("jobs.lever.co/something"), "lever.co")

    def test_fuzzy_name_normalization(self):
        self.assertEqual(matcher.normalize_name("Acme Corp Inc."), "acme")
        self.assertEqual(matcher.normalize_name("Beta LLC"), "beta")

    def test_company_match(self):
        existing_companies = [
            {"id": "1", "name": "Acme Corp", "domain": "acme.com"},
            {"id": "2", "name": "Beta LLC", "domain": "beta.io"}
        ]
        
        # Exact domain match
        self.assertEqual(matcher.find_company_match("Acme", "acme.com", existing_companies), "1")
        
        # Fuzzy match fallback (domain missing, name extremely close)
        self.assertEqual(matcher.find_company_match("Acme Corporation", "", existing_companies), "1")
        
        # No match
        self.assertIsNone(matcher.find_company_match("Charlie Inc", "charlie.com", existing_companies))

    def test_hunter_title_ranking(self):
        # "ceo" is priority 0, "chief product" matches priority 5
        self.assertEqual(_title_rank("Founder & CEO"), 0)
        self.assertEqual(_title_rank("Chief Product Officer"), 5)
        self.assertEqual(_title_rank("Head of Design"), 8)
        self.assertEqual(_title_rank("Software Engineer"), 11) # fallback

    @patch('pipeline.generator.get_client')
    def test_gemini_generator_mocked(self, mock_get_client):
        from pipeline.generator import generate_job_content
        
        # Mock the Gemini response string since the new payload only extracts classifications
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "is_design_role": True,
            "is_crypto_company": True,
            "is_agency": False,
            "skip_tier": False,
            "requirements": ["3+ years experience", "Figma expert"]
        })
        
        mock_client_instance = MagicMock()
        mock_client_instance.models.generate_content.return_value = mock_response
        mock_get_client.return_value = mock_client_instance

        res = generate_job_content("Product Designer", "Acme", "Job description here", "John Doe", "CEO")
        self.assertTrue(res["is_design_role"])
        self.assertTrue(res["is_crypto_company"])
        self.assertEqual(len(res["requirements"]), 2)
        self.assertEqual(res["requirements"][0], "3+ years experience")

if __name__ == '__main__':
    unittest.main(verbosity=2)
