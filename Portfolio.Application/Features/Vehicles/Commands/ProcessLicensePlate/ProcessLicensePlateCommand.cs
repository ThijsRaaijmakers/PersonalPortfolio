using MediatR;
using Portfolio.Domain.Entities;
using Portfolio.Application.Interfaces.Repositories;
using Portfolio.Application.Interfaces.ExternalServices;

namespace Portfolio.Application.Features.Vehicles.Commands.ProcessLicensePlate;

public record ProcessLicensePlateCommand(string LicensePlate) : IRequest<Vehicle>;

public class ProcessLicensePlateCommandHandler : IRequestHandler<ProcessLicensePlateCommand, Vehicle>
{
    private readonly IVehicleRepository _vehicleRepository;
    private readonly IRdwService _rdwService;
    private readonly IGeminiService _geminiService;

    public ProcessLicensePlateCommandHandler(
        IVehicleRepository vehicleRepository,
        IRdwService rdwService,
        IGeminiService geminiService)
    {
        _vehicleRepository = vehicleRepository;
        _rdwService = rdwService;
        _geminiService = geminiService;
    }

    public async Task<Vehicle> Handle(ProcessLicensePlateCommand request, CancellationToken cancellationToken)
    {
        // 1. Check Database first (Cache)
        var existingVehicle = await _vehicleRepository.GetByLicensePlateAsync(request.LicensePlate);
        if (existingVehicle != null)
        {
            return existingVehicle;
        }

        // 2. If not found, call RDW API
        // var rdwData = await _rdwService.FetchRawVehicleDataAsync(request.LicensePlate);
        // (Validation logic here to handle invalid plates)

        // 3. Call Gemini API for context
        // var aiContext = await _geminiService.EnrichVehicleDataAsync(...);

        // 4. Map data to new Vehicle entity, save to DB, and return
        var newVehicle = new Vehicle { LicensePlate = request.LicensePlate /* map other fields later */ };
        
        await _vehicleRepository.AddAsync(newVehicle);
        return newVehicle;
    }
}