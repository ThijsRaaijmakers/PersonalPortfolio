using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Portfolio.Application.Interfaces.Repositories;
using Portfolio.Infrastructure.Persistence;
using Portfolio.Infrastructure.Repositories;

namespace Portfolio.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection")));

        services.AddScoped<IVehicleRepository, VehicleRepository>();

        services.AddHttpClient<IRdwService, RdwService>(client =>
        {
            client.BaseAddress = new Uri("https://opendata.rdw.nl/");
        });

        return services;
    }
}