# Copyright (c) 2026, Alphaworkz and Contributors
# See license.txt

import unittest

from smart_screens.smart_screens.api.oee.adapters.moulding_adapter import pair_plans_with_production


class TestPairPlansWithProduction(unittest.TestCase):
	"""Production must pair with the plan row that issued its job card, never by lot string.

	Fixture shape is real (spp15.local, WRKP-04073): the T5125 row carries lot 26H22Y18,
	but its job card PO-JOB364800 was printed as 26H22Y08, which is the lot the operator
	scanned. The T6100 row also claims 26H22Y08.
	"""

	T5125_ROW = {"job_card": "PO-JOB364800", "lot_number": "26H22Y18", "item_code": "T5125", "mould_ref": "MLD-5125-B"}
	T6100_ROW = {"job_card": "PO-JOB364790", "lot_number": "26H22Y08", "item_code": "T6100", "mould_ref": "MLD-6100-B"}

	def test_drifted_plan_lot_pairs_with_job_card_row(self):
		production = {"job_card": "PO-JOB364800", "lot_number": "26H22Y08", "item_code": "T5125"}

		pairs = pair_plans_with_production([self.T6100_ROW, self.T5125_ROW], [production])

		self.assertEqual(pairs, [(self.T5125_ROW, production)])

	def test_lot_shared_by_two_plan_rows_pairs_once(self):
		replanned = {**self.T6100_ROW, "job_card": "PO-JOB364999"}
		production = {"job_card": "PO-JOB364790", "lot_number": "26H22Y08", "item_code": "T6100"}

		pairs = pair_plans_with_production([self.T6100_ROW, replanned], [production])

		self.assertEqual(pairs, [(self.T6100_ROW, production)])

	def test_unmatched_rows_are_dropped(self):
		orphan = {"job_card": "PO-JOB000001", "lot_number": "26H22Y01", "item_code": "T4007"}

		self.assertEqual(pair_plans_with_production([self.T5125_ROW], [orphan]), [])
		self.assertEqual(pair_plans_with_production([self.T5125_ROW], []), [])

	def test_multiple_entries_on_one_job_card_keep_plan_order(self):
		first = {"job_card": "PO-JOB364800", "lot_number": "26H22Y08", "operator_name": "A"}
		second = {"job_card": "PO-JOB364800", "lot_number": "26H22Y08", "operator_name": "B"}
		t6100 = {"job_card": "PO-JOB364790", "lot_number": "26H22Y01"}

		pairs = pair_plans_with_production([self.T5125_ROW, self.T6100_ROW], [t6100, first, second])

		self.assertEqual(pairs, [(self.T5125_ROW, first), (self.T5125_ROW, second), (self.T6100_ROW, t6100)])
