-- Tiger Data / TimescaleDB schema. Run with `npm run db:init`.
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS txns (
  id          text        NOT NULL,
  account_id  text        NOT NULL,
  ts          timestamptz NOT NULL,
  merchant    text,
  category    text,
  city        text,
  state       text,
  amount      double precision,
  PRIMARY KEY (id, ts)
);
SELECT create_hypertable('txns', 'ts', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS alerts (
  id       text        NOT NULL,
  ts       timestamptz NOT NULL,
  kind     text,
  verdict  text,
  score    int,
  payload  jsonb,
  PRIMARY KEY (id, ts)
);
SELECT create_hypertable('alerts', 'ts', if_not_exists => TRUE);

-- Continuous aggregate: hourly spend per account, powers the live dashboard chart.
CREATE MATERIALIZED VIEW IF NOT EXISTS spend_hourly
WITH (timescaledb.continuous) AS
SELECT account_id, time_bucket('1 hour', ts) AS bucket, sum(amount) AS total, count(*) AS n
FROM txns
GROUP BY account_id, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('spend_hourly',
  start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE);

-- Compression keeps months of history on the free tier.
ALTER TABLE txns SET (timescaledb.compress, timescaledb.compress_segmentby = 'account_id');
SELECT add_compression_policy('txns', INTERVAL '7 days', if_not_exists => TRUE);

