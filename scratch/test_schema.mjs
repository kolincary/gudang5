const url = "https://gmdpdnxxwuczswyilcdc.supabase.co/rest/v1/stock_items";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtZHBkbnh4d3VjenN3eWlsY2RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzQ3NzcsImV4cCI6MjA4NjU1MDc3N30.L9bKADTm3Hh5NVu7tpGvMVXGXtQ8GVaaSlryguENnRU";
fetch(url + "?limit=1", { headers: { apikey: key, Authorization: "Bearer " + key } })
  .then(r => r.json())
  .then(d => console.log(d))
  .catch(e => console.error(e));
