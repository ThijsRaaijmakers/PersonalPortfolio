using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using Portfolio.Application.DTOs;
using Portfolio.Application.Interfaces.ExternalServices;

namespace Portfolio.Infrastructure.ExternalServices.Gemini;

public class GeminiService : IGeminiService
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;

    public GeminiService(HttpClient httpClient, IConfiguration configuration)
    {
        _httpClient = httpClient;
        // Fetch the key safely from User Secrets/Environment variables
        _apiKey = configuration["Gemini:ApiKey"] ?? throw new ArgumentNullException("Gemini API Key is missing");
    }

    public async Task<VehicleContextDto?> EnrichVehicleDataAsync(string make, string model, int buildYear)
    {
        // 1. Construct the exact prompt for the AI
        var prompt = $@"You are an automotive expert. I am delivering a {buildYear} {make} {model}. 
Please provide the following contextual details about this exact car in JSON format:
- Transmission (string: e.g., 'Manual', 'Automatic', 'Single-speed')
- AndroidAutoSupport (string: e.g., 'Wired', 'Wireless', 'None')
- UsbType (string: e.g., 'Type-A', 'Type-C', 'Both', 'None')
- ActionRadiusKm (integer: estimate the real-world electric range if it is an EV, otherwise return null)
- SpecialFeatures (string: mention any unique UX quirks like 'Tesla steering wheel indicators', or keep null if none)

Return ONLY valid JSON matching this exact structure. No markdown blocks, no explanations.";

        // 2. Format the payload for the Gemini API
        var requestBody = new
        {
            contents = new[] { new { parts = new[] { new { text = prompt } } } },
            // Enable Grounding with Google Search so the model can look up new cars
            tools = new[] 
            { 
                new { googleSearch = new { } } 
            },
            generationConfig = new { responseMimeType = "application/json" }
        };

        // 3. Make the HTTP POST request to the Flash model
        var response = await _httpClient.PostAsJsonAsync(
            $"v1beta/models/gemini-1.5-flash:generateContent?key={_apiKey}", 
            requestBody);
        
        if (!response.IsSuccessStatusCode) return null;

        // 4. Extract and deserialize the JSON payload
        var jsonResponse = await response.Content.ReadAsStringAsync();
        
        try
        {
            // Gemini nests the response text deep inside the candidates array
            var geminiData = JsonNode.Parse(jsonResponse);
            var aiTextResponse = geminiData?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.GetValue<string>();
            
            if (string.IsNullOrEmpty(aiTextResponse)) return null;

            return JsonSerializer.Deserialize<VehicleContextDto>(
                aiTextResponse, 
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
            );
        }
        catch
        {
            // In a true enterprise app, we would log this parsing error
            return null;
        }
    }
}