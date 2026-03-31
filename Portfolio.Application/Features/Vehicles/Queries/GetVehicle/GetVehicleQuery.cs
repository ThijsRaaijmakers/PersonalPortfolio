using MediatR;
using Portfolio.Domain.Entities;
using Portfolio.Application.Interfaces.Repositories;

namespace Portfolio.Application.Features.Vehicles.Queries.GetVehicle;

public record GetVehicleQuery(string LicensePlate) : IRequest<Vehicle?>;

public class GetVehicleQueryHandler : IRequestHandler<GetVehicleQuery, Vehicle?>
{
    private readonly IVehicleRepository _vehicleRepository;

    public GetVehicleQueryHandler(IVehicleRepository vehicleRepository)
    {
        _vehicleRepository = vehicleRepository;
    }

    public async Task<Vehicle?> Handle(GetVehicleQuery request, CancellationToken cancellationToken)
    {
        return await _vehicleRepository.GetByLicensePlateAsync(request.LicensePlate);
    }
}