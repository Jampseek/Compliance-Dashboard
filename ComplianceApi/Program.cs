using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);

// Enable CORS for localhost:5173
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowLocalhost5173", policy =>
    {
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors("AllowLocalhost5173");

// GET /api/transactions – returns 10 mock AML transaction objects
app.MapGet("/api/transactions", () =>
{
    var rng = new Random();
    var currencies = new[] { "USD", "EUR", "GBP", "JPY", "CHF" };
    var routes = new[] { "TRANSFER", "DEPOSIT", "WITHDRAWAL", "PAYMENT" };
    var riskLevels = new[] { "Low", "Medium", "High" };
    var statuses = new[] { "Completed", "Pending", "Failed" };

    var list = new List<object>();
    for (int i = 0; i < 10; i++)
    {
        var flags = new List<string>();
        if (rng.NextDouble() < 0.2) flags.Add("SanctionHit");
        if (rng.NextDouble() < 0.1) flags.Add("PEP");

        list.Add(new
        {
            id = Guid.NewGuid().ToString("N"),
            time = DateTime.UtcNow.AddMinutes(-rng.Next(0, 1440)).ToString("o"),
            sender = $"Sender-{rng.Next(1000, 9999)}",
            receiver = $"Receiver-{rng.Next(1000, 9999)}",
            amount = Math.Round(rng.NextDouble() * 10000 + 100, 2),
            currency = currencies[rng.Next(currencies.Length)],
            route = routes[rng.Next(routes.Length)],
            riskScore = Math.Round(rng.NextDouble() * 1.0, 2),
            riskLevel = riskLevels[rng.Next(riskLevels.Length)],
            screeningFlags = flags.ToArray(),
            status = statuses[rng.Next(statuses.Length)]
        });
    }
    return Results.Ok(list);
});

// POST /api/sar/generate – returns a dummy SAR narrative
app.MapPost("/api/sar/generate", async (HttpContext http) =>
{
    // In a real implementation you'd parse the case object from the body
    // Here we just return a placeholder narrative
    return Results.Ok(new { narrative = "Generated SAR narrative based on provided case data." });
});

// POST /api/sar/submit – RBAC check (MLRO or Executive only)
app.MapPost("/api/sar/submit", async (HttpContext http) =>
{
    var submission = await http.Request.ReadFromJsonAsync<Dictionary<string, object>>();
    if (submission == null || !submission.TryGetValue("role", out var roleObj) || roleObj is not string role)
    {
        return Results.BadRequest(new { error = "Missing or invalid role in submission." });
    }

    if (role != "MLRO" && role != "Executive")
    {
        return Results.Forbid();
    }

    return Results.Ok(new { message = "SAR submitted successfully." });
});

app.Run();
