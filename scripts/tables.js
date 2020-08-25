const selector = "#active-trains-table";

export function initDatatable() {
  $(selector).DataTable({
    columns: [
      { title: "Train number", data: "trip", width: "20%" },
      {
        title: "Estimated Delay (secs)",
        data: "estimatedDelay",
        width: "10%",
      },
      { title: "From station", data: "from", width: "20%" },
      { title: "To station", data: "to", width: "20%" },
      { title: "On subsection", data: "subsection" },
    ],
    scrollY: 400,
  });
}

export function updateTableData(data) {
  const datatable = $(selector).dataTable().api();
  datatable.clear();
  datatable.rows.add(data);
  datatable.draw();
}
