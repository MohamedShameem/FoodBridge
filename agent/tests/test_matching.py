import unittest

from foodbridge.domain import rank_recipients


class RecipientMatchingTests(unittest.TestCase):
    def test_refrigerated_donation_excludes_ambient_partner(self):
        matches = rank_recipients(40, refrigerated=True)
        self.assertTrue(matches)
        self.assertTrue(all(match["refrigerated"] for match in matches))

    def test_capacity_constraint_is_never_relaxed(self):
        matches = rank_recipients(100, refrigerated=False)
        self.assertTrue(all(match["capacity"] >= 100 for match in matches))

    def test_closest_reliable_partner_ranks_first(self):
        matches = rank_recipients(60, refrigerated=True)
        self.assertEqual(matches[0]["id"], "partner-1")

    def test_non_positive_meal_count_is_rejected(self):
        with self.assertRaises(ValueError):
            rank_recipients(0, refrigerated=False)


if __name__ == "__main__":
    unittest.main()
