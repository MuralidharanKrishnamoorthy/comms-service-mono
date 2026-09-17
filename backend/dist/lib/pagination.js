// Shared list pagination. Every list endpoint parses page/limit the same way,
// applies pagination AFTER its filters, and returns the same { data, pagination }
// envelope — so the frontend can treat all three (templates, logs, users)
// identically. Fixed at 10 items per page.
export const PAGE_SIZE = 10;
// `page` defaults to 1 and is clamped to >= 1. `limit` defaults to and is capped
// at PAGE_SIZE — a client may ask for fewer but never more. Non-numeric or
// out-of-range values fall back to the defaults rather than silently breaking
// the query. Note `page` is NOT clamped down to totalPages here: a page past the
// end yields an empty `data` array with honest metadata, and the frontend then
// re-requests page 1.
export function parsePageParams(pageRaw, limitRaw) {
    const pageNum = Math.floor(Number(pageRaw));
    const limitNum = Math.floor(Number(limitRaw));
    const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;
    const limit = Number.isFinite(limitNum) && limitNum >= 1 ? Math.min(limitNum, PAGE_SIZE) : PAGE_SIZE;
    return { page, limit };
}
// The number of documents to skip for the given (already validated) page.
export function skipFor(page, limit) {
    return (page - 1) * limit;
}
// totalPages is the count over the FILTERED set. It is 0 when nothing matches
// (an honest "no pages"); the frontend treats totalItems === 0 as an empty list
// rather than trying to navigate to page 1.
export function paginationMeta(page, limit, totalItems) {
    return { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) };
}
