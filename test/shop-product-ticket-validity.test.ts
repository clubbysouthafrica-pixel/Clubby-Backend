/// <reference types="jest" />

import { normalizeProductTicketValidityForResponse, resolveProductTicketValidityForStorage } from "../function_helpers/product_ticket_validity";

describe("product ticket validity", () => {
    test("stores contiguous ticket date ranges as compact fields", () => {
        const resolution = resolveProductTicketValidityForStorage({
            product_type: "ticket",
            valid_day_start_date: "2026-06-10",
            valid_day_end_date: "2026-06-12",
            excluded_valid_day_options: []
        });

        expect(resolution.error).toBeUndefined();
        expect(resolution.fields).toEqual({
            valid_day_start_date: "2026-06-10",
            valid_day_end_date: "2026-06-12",
            excluded_valid_day_options: []
        });
        expect(resolution.removeAttributes).toContain("valid_day_options");
    });

    test("stores excluded dates inside the compact range and expands for responses", () => {
        const resolution = resolveProductTicketValidityForStorage({
            product_type: "ticket",
            valid_day_start_date: "2026-06-10",
            valid_day_end_date: "2026-06-14",
            excluded_valid_day_options: ["2026-06-11", "2026-06-13"]
        });

        expect(resolution.error).toBeUndefined();
        expect(resolution.fields).toEqual({
            valid_day_start_date: "2026-06-10",
            valid_day_end_date: "2026-06-14",
            excluded_valid_day_options: ["2026-06-11", "2026-06-13"]
        });

        expect(normalizeProductTicketValidityForResponse({
            product_type: "ticket",
            ...resolution.fields
        })).toMatchObject({
            valid_day_start_date: "2026-06-10",
            valid_day_end_date: "2026-06-14",
            excluded_valid_day_options: ["2026-06-11", "2026-06-13"]
        });
    });

    test("rejects invalid excluded dates", () => {
        const resolution = resolveProductTicketValidityForStorage({
            product_type: "ticket",
            valid_day_start_date: "2026-06-10",
            valid_day_end_date: "2026-06-12",
            excluded_valid_day_options: ["2026-06-40"]
        });

        expect(resolution.error).toBe("Invalid excluded_valid_day_options provided (Must contain YYYY-MM-DD dates).");
    });

    test("rejects start dates after end dates", () => {
        const resolution = resolveProductTicketValidityForStorage({
            product_type: "ticket",
            valid_day_start_date: "2026-06-12",
            valid_day_end_date: "2026-06-10",
            excluded_valid_day_options: []
        });

        expect(resolution.error).toBe("valid_day_start_date must be less than or equal to valid_day_end_date.");
    });

    test("derives compact validity from legacy valid_day_options", () => {
        const normalizedProduct = normalizeProductTicketValidityForResponse({
            product_type: "ticket",
            valid_day_options: ["2026-06-10", "2026-06-12", "2026-06-13"]
        });

        expect(normalizedProduct).toMatchObject({
            valid_day_start_date: "2026-06-10",
            valid_day_end_date: "2026-06-13",
            excluded_valid_day_options: ["2026-06-11"]
        });
    });
});