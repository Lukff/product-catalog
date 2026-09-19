# Project Overview: Full Stack Product Catalog

This project specification outlines the requirements for building an end-to-end Single Page Application (SPA) and backend API. The project emphasizes clean full-stack architecture, effective engineering workflows, and transparent documentation. Agentic coding tools are encouraged throughout development.

The goal is to demonstrate end-to-end design, implementation quality, and clear technical communication.

## Technology Stack Recommendations

Use your preferred standard tooling and patterns:

* **TypeScript / Node**: Recommended frontend framework (React, Svelte, Vue, etc.), backend router such as Hono (or Express/Fastify), and an ORM/database client of your choice (or raw SQL/in-memory).
* **Python**: Recommended frontend framework alongside FastAPI (or Flask/Django), paired with SQLAlchemy (or raw SQL/in-memory).
* **PHP / Laravel**: Feel free to utilize framework defaults and idioms.

## Documentation & Repository Standards

A successful project requires thorough documentation. The final repository must include:

1. **Source Code**: Fully functional frontend and backend implementations.
2. **`README.md`**: Complete instructions to stand up and run the application locally, along with architectural assumptions, technical decisions, data model notes, and open questions.
3. **`AI.md`**: A dedicated narrative overview of the AI-assisted coding workflow, detailing tooling utilized, prompts and interaction traces, and reflections on what succeeded or required course correction during development.

## Core Requirements

Build an SPA and an API that can be run locally following instructions in the repository. You may use Docker with a relational database, `npm start` with a SQLite database or local JSON file serialization, or any equivalent setup. Architectural decisions should be made with a focus on future maintainability and ease of developer onboarding.

## Data Specification

Seed or initialize the datastore using the following schema template:

```json
[
  {
    "id": 1,
    "title": "Large Flux Capacitor",
    "description": "The Large Flux Capacitor provides the maximum motive force for your inter-dimensional aluminum automobile.",
    "category": "automotive",
    "price": 9.99,
    "stock": 42,
    "brand": "ACME",
    "sku": "ACM-FC-001",
    "weight": 4,
    "meta": {
      "createdAt": "2025-04-30T09:41:02.053Z",
      "updatedAt": "2025-04-30T09:41:02.053Z"
    }
  },
  {
    "id": 2,
    "title": "Medium Flux Capacitor",
    "description": "The Medium Flux Capacitor is a great budget option if you don't need to travel far in your inter-dimensional aluminum automobile.",
    "category": "automotive",
    "price": 5.99,
    "stock": 42,
    "brand": "ACME",
    "sku": "ACM-FC-002",
    "weight": 3.25,
    "meta": {
      "createdAt": "2025-04-29T19:36:02.053Z",
      "updatedAt": "2025-04-30T09:41:02.053Z"
    }
  },
  { "...": "..." },
  { "...": "..." }
]
```

## API Specification

Implement an API providing the endpoints listed below, accompanied by standard testing patterns (unit, integration, or contract tests) and automated CI workflows (e.g., GitHub Actions).

### Required Endpoints

* **Get all products**: Return paginated items (default limit: 30 items)
* **Get a single product**: Retrieve by unique identifier
* **Search products**: Search by `name` or `description` (case-insensitive substring match is acceptable)
* **Create product (`POST`)**: Validate and persist a new product record
* **Update product (`PUT` or `PATCH`)**: Update existing product fields and refresh timestamps
* **Delete product (`DELETE`)**: Remove a product record

### Optional / Extended Endpoints

* Sorting and ordering (e.g., by price, date, stock)
* Create new product category
* Get all product categories
* Get product category list
* Get products filtered by category

## SPA Specification

Create a frontend interface that exercises all core API capabilities. Make deliberate and intuitive UX/UI choices. For example:

* A central dashboard listing product summaries and key metrics.
* Search and filtering controls.
* Views or modals for inspecting item details.
* Forms for creating, updating, and deleting products.

## Engineering Process & Scope Extension

* **Target Execution Scope**: Scope initial development to approximately 60–90 minutes of focused effort. Prioritize core end-to-end functionality first; if any secondary features remain incomplete, document next steps in the `README.md`.
* **Product Decisions**: Document any design or schema decisions made to clarify or extend the baseline specification.
* **Custom Feature Extension**: Beyond the baseline specification, add at least one unprompted feature or capability (e.g., bulk operations, audit logs, low-stock alerts, CSV export, or advanced filtering). Document the rationale: what problem it solves, the intended persona/user, and why it was selected.

## Deliverables

1. A Git repository containing the complete application codebase, including the configured `README.md` and `AI.md`.
2. A screen recording of the development session, or alternatively, a recorded session trace of agent prompts and interactions.