-- ==============================================================================
-- Migration 003: Circulation & Lending System (UP)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS circulation_loans (
    id SERIAL PRIMARY KEY,
    item_id INT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    loan_type VARCHAR(20) NOT NULL DEFAULT 'PHYSICAL', -- 'PHYSICAL' | 'DIGITAL'
    borrowed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_at TIMESTAMPTZ NOT NULL,
    returned_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'LOST'
    renewal_count INT NOT NULL DEFAULT 0,
    issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS circulation_holds (
    id SERIAL PRIMARY KEY,
    item_id INT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'READY_FOR_PICKUP' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED'
    notified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (item_id, user_id, status)
);

CREATE INDEX IF NOT EXISTS idx_loans_user ON circulation_loans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_item ON circulation_loans(item_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_due ON circulation_loans(due_at) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_holds_item ON circulation_holds(item_id, status);
CREATE INDEX IF NOT EXISTS idx_holds_user ON circulation_holds(user_id, status);
