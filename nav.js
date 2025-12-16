document.addEventListener("DOMContentLoaded", () => {
  const currentPage =
    location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll("nav a").forEach(link => {
    if (link.getAttribute("href") === currentPage) {
      link.classList.add("active");
    }
  });
});
